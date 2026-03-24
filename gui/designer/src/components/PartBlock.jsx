import { useDrag, useDrop } from 'react-dnd';
import { FEATURE_PAIRS, getFragColor, isMarker } from '../theme';

export default function PartBlock({ fragment, index, onRemove, onToggleAmplification, onReorder, pcrSize, onSplitSignal }) {
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
  const color = isMarker(fragment.name) ? '#F0E442' : getFragColor(fragment.type, index);

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
      {/* Block — composite shows sub-parts, regular shows single block */}
      <div className="h-14 flex items-center min-w-[80px] rounded-sm select-none overflow-hidden"
        style={{ background: color }}
        onDoubleClick={() => onToggleAmplification(index)}
        title="Double-click to toggle PCR amplification">
        {fragment.subParts?.length > 0 ? (
          /* Composite: show stacked sub-parts */
          fragment.subParts.map((sp, si) => {
            const spColor = getFragColor(sp.type, si);
            return (
              <div key={si} className="h-full flex items-center px-1 text-[8px] text-white/90
                                       border-r border-white/20 last:border-r-0"
                style={{ background: spColor, flex: 1 }}>
                {sp.name}
              </div>
            );
          })
        ) : (
          <div className="flex-1 flex items-center justify-center text-white text-sm font-semibold px-4">
            {fragment.strand === -1 && <span className="text-xs mr-1 opacity-60">&larr;</span>}
            {fragment.name}
            {fragment.strand !== -1 && <span className="text-xs ml-1 opacity-60">&rarr;</span>}
          </div>
        )}
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
      {/* Intron badge */}
      {fragment.has_introns && fragment.introns?.length > 0 && (
        <div className="text-center text-[8px] bg-gray-200 text-gray-600 rounded px-1 mx-auto w-fit">
          {fragment.introns.length} intron{fragment.introns.length > 1 ? 's' : ''}
        </div>
      )}
      {/* Signal peptide split (CDS only) */}
      {fragment.type === 'CDS' && onSplitSignal && (
        <button onClick={(e) => { e.stopPropagation(); onSplitSignal(index); }}
          className="absolute -top-2 -left-2 w-5 h-5 bg-orange-400 text-white rounded-full
                     text-[10px] hidden group-hover:flex items-center justify-center
                     hover:bg-orange-500" title="Split signal peptide">
          {'\u2702'}
        </button>
      )}
      {/* Remove */}
      <button onClick={() => onRemove(index)}
        className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 text-white rounded-full
                   text-[10px] hidden group-hover:flex items-center justify-center
                   hover:bg-red-600">&times;</button>
    </div>
  );
}
