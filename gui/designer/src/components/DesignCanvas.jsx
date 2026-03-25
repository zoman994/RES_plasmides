import { useDrop } from 'react-dnd';
import PartBlock from './PartBlock';
import JunctionBlock from './JunctionBlock';
import JunctionDNA from './JunctionDNA';
import { getFragColor, isMarker } from '../theme';

function fragColor(frag, idx) {
  return isMarker(frag.name) ? '#F0E442' : getFragColor(frag.type, idx);
}

export default function DesignCanvas({
  fragments, junctions, circular, onToggleCircular,
  onDrop, onRemove, onToggleAmplification, onJunctionChange, onReorder, onFlip,
  calculated, pcrSizes = [], onSplitSignal, primers = [],
}) {
  const [{ isOver }, drop] = useDrop({
    accept: 'PART',
    drop: (item) => onDrop(item.part),
    collect: m => ({ isOver: m.isOver() }),
  });

  const totalBp = fragments.reduce((s, f) => s + (f.length || 0), 0);
  const n = fragments.length;
  const hasPrimers = calculated && primers.length > 0;

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
              {circular ? '⭕ Circular' : '📏 Linear'}
            </button>
          </div>

          <div className="flex items-center">
            {/* 5' cap */}
            <div className={`w-1.5 bg-gray-300 rounded-l ${hasPrimers ? 'h-[72px]' : 'h-14'}`} />

            {fragments.map((frag, i) => {
              // Find primers for this fragment
              const fwdPrimer = primers.find(p => p.direction === 'forward' && p.name.includes(frag.name)) || null;
              const revPrimer = primers.find(p => p.direction === 'reverse' && p.name.includes(frag.name)) || null;

              // Neighbor colors for tail coloring
              const leftIdx = circular ? (i - 1 + n) % n : i - 1;
              const rightIdx = circular ? (i + 1) % n : i + 1;
              const leftNeighborColor = (leftIdx >= 0 && leftIdx < n && leftIdx !== i)
                ? fragColor(fragments[leftIdx], leftIdx) : null;
              const rightNeighborColor = (rightIdx >= 0 && rightIdx < n && rightIdx !== i)
                ? fragColor(fragments[rightIdx], rightIdx) : null;

              return (
                <div key={frag.id || i} className="flex items-center">
                  <PartBlock fragment={frag} index={i}
                    onRemove={onRemove} onToggleAmplification={onToggleAmplification}
                    onReorder={onReorder} onFlip={onFlip} pcrSize={pcrSizes[i]}
                    onSplitSignal={onSplitSignal}
                    fwdPrimer={fwdPrimer} revPrimer={revPrimer}
                    leftNeighborColor={leftNeighborColor}
                    rightNeighborColor={rightNeighborColor} />
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
              );
            })}

            {/* Circular: show closing junction label */}
            {circular && n > 1 && (
              <div className="text-[9px] text-blue-500 font-medium ml-1">&rarr;1st</div>
            )}

            {/* 3' cap */}
            <div className={`w-1.5 bg-gray-300 rounded-r ${hasPrimers ? 'h-[72px]' : 'h-14'}`} />
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
