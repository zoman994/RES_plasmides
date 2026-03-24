import { useDrop } from 'react-dnd';
import PartBlock from './PartBlock';
import JunctionBlock from './JunctionBlock';
import JunctionDNA from './JunctionDNA';

export default function DesignCanvas({
  fragments, junctions, circular, onToggleCircular,
  onDrop, onRemove, onToggleAmplification, onJunctionChange, onReorder,
  calculated,
}) {
  const [{ isOver }, drop] = useDrop({
    accept: 'PART',
    drop: (item) => onDrop(item.part),
    collect: m => ({ isOver: m.isOver() }),
  });

  const totalBp = fragments.reduce((s, f) => s + (f.length || 0), 0);
  const n = fragments.length;

  return (
    <div ref={drop}
      className={`flex-1 min-h-[220px] border-2 border-dashed rounded-xl p-6
        flex flex-col items-center justify-center transition
        ${isOver ? 'border-blue-400 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>

      {n === 0 ? (
        <div className="text-gray-400 text-sm select-none">
          Drag parts from the palette to start building your construct
        </div>
      ) : (
        <>
          {/* Topology toggle + info */}
          <div className="flex items-center gap-4 mb-3 select-none">
            <div className="text-[11px] text-gray-400">
              5' &rarr;&rarr;&rarr; construct assembly &rarr;&rarr;&rarr; 3'
            </div>
            <button onClick={onToggleCircular}
              className={`text-[11px] px-3 py-1 rounded-full font-medium transition
                ${circular ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
              {circular ? '\u2B55 Circular' : '\uD83D\uDCCF Linear'}
            </button>
          </div>

          <div className="flex items-center">
            {/* 5' cap */}
            <div className="w-1.5 h-14 bg-gray-300 rounded-l" />

            {fragments.map((frag, i) => (
              <div key={frag.id || i} className="flex items-center">
                <PartBlock fragment={frag} index={i}
                  onRemove={onRemove} onToggleAmplification={onToggleAmplification}
                  onReorder={onReorder} />
                {/* Junction between fragments */}
                {i < junctions.length && (i < n - 1 || circular) && (
                  <div className="flex flex-col items-center">
                    <JunctionBlock
                      junction={junctions[i]}
                      index={i}
                      leftName={frag.name}
                      rightName={fragments[(i + 1) % n]?.name || '?'}
                      onChange={cfg => onJunctionChange(i, cfg)} />
                    <JunctionDNA junction={junctions[i]} calculated={calculated} />
                  </div>
                )}
              </div>
            ))}

            {/* Circular: show closing junction label */}
            {circular && n > 1 && (
              <div className="text-[9px] text-blue-500 font-medium ml-1">&rarr;1st</div>
            )}

            {/* 3' cap */}
            <div className="w-1.5 h-14 bg-gray-300 rounded-r" />
          </div>

          <div className="text-xs text-gray-500 mt-3 select-none">
            Total: {totalBp >= 1000 ? `${(totalBp / 1000).toFixed(1)} kb` : `${totalBp} bp`}
            {' '}{circular ? 'circular' : 'linear'}
            {' '}&middot; {n} fragments &middot; {junctions.length} junctions
          </div>
        </>
      )}
    </div>
  );
}
