import { useDrag } from 'react-dnd';
import { useState, useMemo } from 'react';
import { FEATURE_COLORS, getColor } from '../theme';
import { t } from '../i18n';

function DraggablePart({ part }) {
  const [{ isDragging }, drag] = useDrag({
    type: 'PART',
    item: { part },
    collect: m => ({ isDragging: m.isDragging() }),
  });
  const color = getColor(part);
  return (
    <div ref={drag} style={{ opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded cursor-grab
                 bg-white border border-gray-100 hover:border-gray-300 hover:shadow-sm transition">
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="text-xs font-medium truncate">{part.name}</span>
      <span className="text-[10px] text-gray-400 ml-auto">{part.length >= 1000
        ? `${(part.length / 1000).toFixed(1)}k` : `${part.length}`}</span>
    </div>
  );
}

export default function PartsPalette({ parts, onOpenModal, inventoryVersion = 0 }) {
  const [search, setSearch] = useState('');
  const filtered = parts.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()));
  const grouped = {};
  filtered.forEach(p => {
    (grouped[p.type] = grouped[p.type] || []).push(p);
  });

  // Load inventory items
  const { getPCRProducts, getVerifiedPlasmids } = require('../inventory');
  const pcrProducts = useMemo(() => getPCRProducts(), [inventoryVersion]);
  const plasmids = useMemo(() => getVerifiedPlasmids(), [inventoryVersion]);

  return (
    <div className="w-52 bg-white border-r border-gray-100 p-3 overflow-y-auto shrink-0 flex flex-col">
      <h3 className="text-sm font-bold text-gray-700 mb-2">{t('Parts Library')}</h3>
      <input type="text" placeholder={t('Search...')} value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full text-xs p-1.5 border rounded mb-3 outline-none focus:border-blue-400" />

      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([type, items]) => (
          <div key={type}>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-3 mb-1 font-semibold">
              {t(type)}
            </div>
            {items.map(p => <DraggablePart key={p.id} part={p} />)}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-xs text-gray-400 text-center mt-6">No parts found</div>
        )}
      </div>

      {/* Inventory: PCR products */}
      {pcrProducts.length > 0 && (
        <div>
          <div className="text-[10px] text-amber-600 uppercase tracking-wider font-semibold mt-4 mb-1">
            {'\uD83E\uDDEA'} \u0418\u043c\u0435\u044e\u0449\u0438\u0435\u0441\u044f \u041f\u0426\u0420-\u043f\u0440\u043e\u0434\u0443\u043a\u0442\u044b
          </div>
          {pcrProducts.map(item => (
            <DraggablePart key={item.id} part={{
              id: item.id, name: item.name, type: 'pcr_product',
              sequence: item.sequence, length: item.length,
              needsAmplification: false, concentration: item.concentration,
            }} />
          ))}
        </div>
      )}

      {/* Inventory: Verified plasmids */}
      {plasmids.length > 0 && (
        <div>
          <div className="text-[10px] text-purple-600 uppercase tracking-wider font-semibold mt-4 mb-1">
            {'\uD83D\uDC8A'} \u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d\u043d\u044b\u0435 \u043f\u043b\u0430\u0437\u043c\u0438\u0434\u044b
          </div>
          {plasmids.map(item => (
            <DraggablePart key={item.id} part={{
              id: item.id, name: item.name, type: 'plasmid',
              sequence: item.sequence, length: item.length,
              needsAmplification: false, concentration: item.concentration,
            }} />
          ))}
        </div>
      )}

      {/* Custom sources */}
      <div className="mt-3 pt-3 border-t space-y-1">
        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-semibold">
          {t('Custom sources')}
        </div>
        <button onClick={() => onOpenModal('composite')}
          className="w-full text-left text-xs p-2 rounded border border-dashed
                     border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition">
          {'\uD83E\uDDEA'} {t('From PCR product / tube')}
        </button>
        <button onClick={() => onOpenModal('construct')}
          className="w-full text-left text-xs p-2 rounded border border-dashed
                     border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition">
          {'\uD83D\uDCCB'} {t('From existing construct')}
        </button>
        <button onClick={() => onOpenModal('sequence')}
          className="w-full text-left text-xs p-2 rounded border border-dashed
                     border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition">
          {'\u270F\uFE0F'} {t('Paste custom sequence')}
        </button>
      </div>
    </div>
  );
}
