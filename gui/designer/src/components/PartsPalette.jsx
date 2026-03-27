import { useDrag } from 'react-dnd';
import { useState, useMemo } from 'react';
import { FEATURE_COLORS, getColor } from '../theme';
import { t } from '../i18n';
import { getPCRProducts, getVerifiedPlasmids } from '../inventory';
import { getPartDescription } from '../part-descriptions';
import { SBOLIcon } from '../sbol-glyphs';
import { getCollections, createCollection, addToCollection, removeFromCollection } from '../collections';

function DraggablePart({ part, collectionId, onRemoveFromColl }) {
  const [{ isDragging }, drag] = useDrag({
    type: 'PART', item: { part },
    collect: m => ({ isDragging: m.isDragging() }),
  });
  const color = getColor(part);
  const desc = getPartDescription(part.name, part.type);
  return (
    <div ref={drag} style={{ opacity: isDragging ? 0.4 : 1 }}
      title={desc.short + (desc.note ? `\n⚠ ${desc.note}` : '')}
      className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded cursor-grab
                 bg-white border border-gray-100 hover:border-gray-300 hover:shadow-sm transition group">
      <SBOLIcon type={part.type} size={14} color={color} />
      <span className="text-xs font-medium truncate flex-1">{part.name}</span>
      <span className="text-[10px] text-gray-400">{part.length}</span>
      {collectionId && onRemoveFromColl && (
        <button onClick={(e) => { e.stopPropagation(); onRemoveFromColl(collectionId, part.id); }}
          className="hidden group-hover:block text-[9px] text-gray-300 hover:text-red-500" title="Убрать из коллекции">✕</button>
      )}
    </div>
  );
}

export default function PartsPalette({ parts, onOpenModal, onOpenLibrary, inventoryVersion = 0 }) {
  const [search, setSearch] = useState('');
  const [activeCollId, setActiveCollId] = useState(null); // null = all parts
  const [collVer, setCollVer] = useState(0);

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
        {Object.entries(grouped).map(([type, items]) => (
          <div key={type}>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-3 mb-1 font-semibold">
              {t(type)}
            </div>
            {items.map(p => (
              <div key={p.id} className="relative group/item">
                <DraggablePart part={p} collectionId={activeCollId} onRemoveFromColl={handleRemoveFromColl} />
                {/* Add to collection button (shown when viewing all, with active collection) */}
                {!activeCollId && collections.length > 0 && (
                  <button onClick={() => {
                    const collId = collections[collections.length - 1]?.id;
                    if (collId) { addToCollection(collId, p.id); setCollVer(v => v + 1); }
                  }}
                    className="absolute right-1 top-1 hidden group-hover/item:block text-[8px] text-gray-300 hover:text-blue-500"
                    title={`Добавить в ${collections[collections.length - 1]?.name}`}>
                    {'📁+'}
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-xs text-gray-400 text-center mt-6">
            {activeCollId ? 'Коллекция пуста — добавьте запчасти' : 'Ничего не найдено'}
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
        <button onClick={() => onOpenModal('composite')}
          className="w-full text-left text-xs p-2 rounded border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition">
          {'🧪'} {t('From PCR product / tube')}
        </button>
        <button onClick={() => onOpenModal('construct')}
          className="w-full text-left text-xs p-2 rounded border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition">
          {'📋'} {t('From existing construct')}
        </button>
        <button onClick={() => onOpenModal('sequence')}
          className="w-full text-left text-xs p-2 rounded border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition">
          {'✏️'} {t('Paste custom sequence')}
        </button>
        {onOpenLibrary && (
          <button onClick={onOpenLibrary}
            className="w-full text-center text-[10px] text-blue-600 hover:underline mt-2">
            {'📦'} Полная библиотека →
          </button>
        )}
      </div>
    </div>
  );
}
