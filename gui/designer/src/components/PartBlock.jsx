import { useDrag } from 'react-dnd';

const COLORS = {
  CDS: '#F5A623', promoter: '#B0B0B0', terminator: '#CC0000',
  rep_origin: '#FFD700', marker: '#31AF31', misc_feature: '#6699CC',
  regulatory: '#9B59B6',
};

export default function PartBlock({ fragment, index, onRemove, onToggleAmplification }) {
  const [{ isDragging }, drag] = useDrag({
    type: 'CANVAS_PART',
    item: { index },
    collect: m => ({ isDragging: m.isDragging() }),
  });
  const color = COLORS[fragment.type] || '#6699CC';

  return (
    <div ref={drag} className="relative group cursor-grab"
      style={{ opacity: isDragging ? 0.4 : 1 }}>
      {/* No-PCR badge */}
      {!fragment.needsAmplification && (
        <div className="absolute -top-5 left-0 right-0 text-center">
          <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded">no PCR</span>
        </div>
      )}
      {/* Block */}
      <div className="h-14 px-4 flex items-center justify-center text-white text-sm
                      font-semibold min-w-[80px] rounded-sm select-none"
        style={{ background: color }}
        onDoubleClick={() => onToggleAmplification(index)}
        title="Double-click to toggle PCR amplification">
        {fragment.strand === -1 && <span className="text-xs mr-1 opacity-60">&larr;</span>}
        {fragment.name}
        {fragment.strand !== -1 && <span className="text-xs ml-1 opacity-60">&rarr;</span>}
      </div>
      {/* Length */}
      <div className="text-center text-[10px] text-gray-400 mt-0.5">
        {fragment.length >= 1000
          ? `${(fragment.length / 1000).toFixed(1)} kb`
          : `${fragment.length} bp`}
      </div>
      {/* Remove */}
      <button onClick={() => onRemove(index)}
        className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 text-white rounded-full
                   text-[10px] hidden group-hover:flex items-center justify-center
                   hover:bg-red-600">&times;</button>
    </div>
  );
}
