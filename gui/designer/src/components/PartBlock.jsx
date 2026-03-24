import { useDrag, useDrop } from 'react-dnd';

const COLOR_PAIRS = {
  CDS:          ['#F5A623', '#D4890F'],
  promoter:     ['#B0B0B0', '#808080'],
  terminator:   ['#CC0000', '#990000'],
  rep_origin:   ['#FFD700', '#CCA300'],
  marker:       ['#31AF31', '#1E7D1E'],
  misc_feature: ['#6699CC', '#3366AA'],
  regulatory:   ['#9B59B6', '#7D3C98'],
};

export default function PartBlock({ fragment, index, onRemove, onToggleAmplification, onReorder, pcrSize }) {
  const [{ isDragging }, drag] = useDrag({
    type: 'CANVAS_PART',
    item: { index },
    collect: m => ({ isDragging: m.isDragging() }),
  });

  const [{ isOver }, drop] = useDrop({
    accept: 'CANVAS_PART',
    drop: (item) => {
      if (item.index !== index && onReorder) onReorder(item.index, index);
    },
    collect: m => ({ isOver: m.isOver() }),
  });

  const ref = (el) => { drag(drop(el)); };
  const pair = COLOR_PAIRS[fragment.type] || ['#6699CC', '#3366AA'];
  const color = pair[index % 2];

  return (
    <div ref={ref} className={`relative group cursor-grab transition-transform
      ${isOver ? 'scale-105' : ''}`}
      style={{ opacity: isDragging ? 0.3 : 1 }}>
      {/* Drop indicator */}
      {isOver && <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-blue-500 rounded" />}
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
      {/* Length + PCR size */}
      <div className="text-center text-[10px] text-gray-400 mt-0.5">
        {fragment.length >= 1000
          ? `${(fragment.length / 1000).toFixed(1)} kb`
          : `${fragment.length} bp`}
      </div>
      {pcrSize && (
        <div className="text-center text-[9px] text-blue-500 font-medium">
          PCR: {pcrSize} bp
        </div>
      )}
      {/* Remove */}
      <button onClick={() => onRemove(index)}
        className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 text-white rounded-full
                   text-[10px] hidden group-hover:flex items-center justify-center
                   hover:bg-red-600">&times;</button>
    </div>
  );
}
