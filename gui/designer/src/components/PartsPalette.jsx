import { useDrag } from 'react-dnd';
import { useState } from 'react';

const COLORS = {
  CDS: '#F5A623', promoter: '#B0B0B0', terminator: '#CC0000',
  rep_origin: '#FFD700', marker: '#31AF31', misc_feature: '#6699CC',
  regulatory: '#9B59B6',
};

function DraggablePart({ part }) {
  const [{ isDragging }, drag] = useDrag({
    type: 'PART',
    item: { part },
    collect: m => ({ isDragging: m.isDragging() }),
  });
  const color = COLORS[part.type] || '#6699CC';
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

export default function PartsPalette({ parts }) {
  const [search, setSearch] = useState('');
  const filtered = parts.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()));
  const grouped = {};
  filtered.forEach(p => {
    (grouped[p.type] = grouped[p.type] || []).push(p);
  });

  return (
    <div className="w-52 bg-white border-r border-gray-100 p-3 overflow-y-auto shrink-0">
      <h3 className="text-sm font-bold text-gray-700 mb-2">Parts Library</h3>
      <input type="text" placeholder="Search..." value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full text-xs p-1.5 border rounded mb-3 outline-none focus:border-blue-400" />
      {Object.entries(grouped).map(([type, items]) => (
        <div key={type}>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-3 mb-1 font-semibold">
            {type}
          </div>
          {items.map(p => <DraggablePart key={p.id} part={p} />)}
        </div>
      ))}
      {filtered.length === 0 && (
        <div className="text-xs text-gray-400 text-center mt-6">No parts found</div>
      )}
    </div>
  );
}
